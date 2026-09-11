import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("native public environment values use direct reads that Expo can inline in production", () => {
  const source = ts.createSourceFile("native.ts", readFileSync(new URL("../../../packages/env/src/native.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.flatMap((statement) => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
    .find((item) => ts.isIdentifier(item.name) && item.name.text === "env");
  const call = declaration?.initializer;
  assert.ok(call && ts.isCallExpression(call));
  const config = call.arguments[0];
  assert.ok(config && ts.isObjectLiteralExpression(config));
  const property = (object: ts.ObjectLiteralExpression, name: string) => object.properties.find((item): item is ts.PropertyAssignment => ts.isPropertyAssignment(item) && ts.isIdentifier(item.name) && item.name.text === name);
  const client = property(config, "client")?.initializer;
  const runtime = property(config, "runtimeEnv")?.initializer;
  assert.ok(client && ts.isObjectLiteralExpression(client));
  assert.ok(runtime && ts.isObjectLiteralExpression(runtime), "Passing the whole process.env object leaves public values undefined in Expo production bundles.");
  assert.equal(runtime.properties.length, client.properties.length, "Expose only the explicitly validated public variables.");
  for (const field of client.properties) {
    assert.ok(ts.isPropertyAssignment(field) && ts.isIdentifier(field.name));
    const name = field.name.text;
    assert.ok(name.startsWith("EXPO_PUBLIC_"));
    const value = property(runtime, name)?.initializer;
    assert.ok(value && ts.isPropertyAccessExpression(value) && value.name.text === name, `${name} must use a direct public environment property read.`);
    assert.ok(ts.isPropertyAccessExpression(value.expression) && value.expression.name.text === "env");
    assert.ok(ts.isIdentifier(value.expression.expression) && value.expression.expression.text === "process");
  }
});
