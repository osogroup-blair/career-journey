// The implementation lives in src/lib so the client editor allocates ids the same way
// the AI patch endpoints do. Re-exported here so server imports keep working.
export { computeNextIds, computeNextVersion, versionChangesKey } from "../src/lib/careerJourneyIds";
