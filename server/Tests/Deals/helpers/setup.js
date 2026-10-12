// Register deal indexes after the existing UAT database setup finishes.
// Keep the shared UAT setup and every existing test suite unchanged.
const Deal = require("../../../models/deal.model");
beforeAll(async () => { await Deal.init(); });
