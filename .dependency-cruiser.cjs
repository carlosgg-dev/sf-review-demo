/** Layer rules of ARCHITECTURE.md. */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "domain-is-pure",
      severity: "error",
      from: { path: "^src/domain/" },
      to: { path: "^src/(application|persistence|http|config|main)" },
    },
    {
      name: "application-depends-on-domain-only",
      severity: "error",
      from: { path: "^src/application/" },
      to: { path: "^src/(persistence|http|config|main)" },
    },
    {
      name: "persistence-is-not-a-caller",
      severity: "error",
      from: { path: "^src/persistence/" },
      to: { path: "^src/(http|config|main)" },
    },
    {
      name: "http-goes-through-application",
      severity: "error",
      from: { path: "^src/http/" },
      to: { path: "^src/(persistence|config|main)" },
    },
    {
      name: "src-does-not-import-tests-of-features",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "^features/" },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
