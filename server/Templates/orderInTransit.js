const orderStatusTemplate = require("./orderDispatched");

module.exports = (params) => orderStatusTemplate({ ...params, inTransit: true });
