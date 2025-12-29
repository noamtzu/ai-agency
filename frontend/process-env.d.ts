// Minimal `process.env` typing for this project.
// We intentionally avoid pulling in full Node.js typings.
declare const process: {
  env: Record<string, string | undefined>;
};


