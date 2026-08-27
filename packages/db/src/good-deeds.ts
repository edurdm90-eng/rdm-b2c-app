export const goodDeedsById = {
  "helped-neighbor": { title: "Helped a neighbor", reward: 20 },
  "recycled-home": { title: "Recycled waste at home", reward: 15 },
  "complimented-sincerely": { title: "Complimented someone sincerely", reward: 10 },
  "gave-priority": { title: "Gave up your seat / priority", reward: 10 },
  "donated-items": { title: "Donated old clothes / books", reward: 25 },
  "checked-on-someone": { title: "Checked on someone who's struggling", reward: 20 },
} as const;

export type GoodDeedId = keyof typeof goodDeedsById;

export const goodDeedIds = Object.keys(goodDeedsById) as [GoodDeedId, ...GoodDeedId[]];

export const goodDeedCatalog = goodDeedIds.map((id) => ({
  id,
  ...goodDeedsById[id],
}));
