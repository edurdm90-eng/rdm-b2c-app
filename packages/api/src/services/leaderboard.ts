import { GoalGroup, RdmProfile, Referral } from "@rdm-b2c/db";

type LeaderboardScope = "friends" | "groups" | "global";

export async function savedLeaderboard(userId: string, scope: LeaderboardScope) {
  const memberIds = new Set<string>([userId]);
  if (scope === "friends") {
    const referrals = await Referral.find({ $or: [{ inviterId: userId }, { inviteeId: userId }] })
      .select("inviterId inviteeId")
      .lean();
    for (const referral of referrals) {
      memberIds.add(referral.inviterId);
      memberIds.add(referral.inviteeId);
    }
  }
  if (scope === "groups") {
    const groups = await GoalGroup.find({
      creationId: { $type: "string" },
      members: { $elemMatch: { userId, fundingStatus: "funded" } },
    }).select("members.userId members.fundingStatus").lean<Array<{
      members: Array<{ userId?: string; fundingStatus: "pending" | "funded" }>;
    }>>();
    for (const group of groups) {
      for (const member of group.members) {
        if (member.userId && member.fundingStatus === "funded") memberIds.add(member.userId);
      }
    }
  }

  const profiles = await RdmProfile.aggregate<{ userId: string; xp: number; name: string }>([
    { $match: { ...(scope === "global" ? {} : { userId: { $in: [...memberIds] } }), xp: { $gte: 0 } } },
    {
      $lookup: {
        from: "user",
        let: {
          accountId: { $convert: { input: "$userId", to: "objectId", onError: null, onNull: null } },
          accountStringId: "$userId",
        },
        pipeline: [
          { $match: { $expr: { $or: [{ $eq: ["$_id", "$$accountId"] }, { $eq: ["$_id", "$$accountStringId"] }] } } },
          { $project: { name: 1 } },
        ],
        as: "account",
      },
    },
    { $match: { "account.0": { $exists: true } } },
    { $sort: { xp: -1, userId: 1 } },
    { $limit: 50 },
    { $project: { _id: 0, userId: 1, xp: 1, name: { $arrayElemAt: ["$account.name", 0] } } },
  ]);

  return profiles.map((profile, index) => {
    const parts = String(profile.name ?? "").trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? "RDM member";
    const lastInitial = parts.length > 1 ? parts.at(-1)?.charAt(0).toUpperCase() : "";
    return {
      name: `${firstName}${lastInitial ? ` ${lastInitial}.` : ""}`,
      initials: `${firstName.charAt(0)}${lastInitial}`.toUpperCase(),
      points: profile.xp,
      rank: index + 1,
      currentUser: profile.userId === userId,
    };
  });
}
