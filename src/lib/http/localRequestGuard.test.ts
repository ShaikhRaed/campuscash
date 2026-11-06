import { describe, expect, it } from "vitest";
import { localRequestProblem } from "./localRequestGuard";

const check = (headers: Record<string, string>) => localRequestProblem(new Headers(headers));

describe("requests the sandbox accepts", () => {
  it.each([
    [{ host: "127.0.0.1:3000" }],
    [{ host: "localhost:3000" }],
    [{ host: "[::1]:3000" }],
    [{ host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }],
    [{ host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" }],
    [{ host: "localhost:3000", "sec-fetch-site": "none" }],
  ])("accepts %j", (headers) => {
    expect(check(headers)).toBeNull();
  });
});

describe("requests the sandbox refuses", () => {
  it.each([
    ["no Host", {}],
    ["a DNS-rebinding Host", { host: "attacker.example:3000", origin: "http://attacker.example:3000", "sec-fetch-site": "same-origin" }],
    ["a LAN address", { host: "192.168.1.20:3000" }],
    ["a lookalike host", { host: "localhost.attacker.example:3000" }],
    ["a cross-site browser request", { host: "127.0.0.1:3000", "sec-fetch-site": "cross-site" }],
    ["a same-site request from another port", { host: "127.0.0.1:3000", "sec-fetch-site": "same-site" }],
    ["a foreign Origin", { host: "127.0.0.1:3000", origin: "http://attacker.example" }],
    ["localhost and 127.0.0.1 mixed", { host: "127.0.0.1:3000", origin: "http://localhost:3000" }],
    ["another local port", { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3201" }],
    ["an opaque Origin", { host: "127.0.0.1:3000", origin: "null" }],
  ])("refuses %s", (_name, headers) => {
    expect(check(headers as Record<string, string>)).not.toBeNull();
  });
});
