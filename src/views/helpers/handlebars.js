const _ = require('lodash');

const helpers = {
  json(obj, pretty = false) {
    if (pretty) {
      var d = JSON.stringify(obj, null, 2);
      return d;
    }
    return JSON.stringify(obj);
  },

  adjustedPage(currentPage, pageSize, newPageSize) {
    const firstId = (currentPage - 1) * pageSize;
    return _.ceil(firstId / newPageSize) + 1;
  },

  block(name) {
    var blocks = this._blocks;
        content = blocks && blocks[name];
    return content ? content.join('\n') : null;
  },

  contentFor: function(name, options) {
    var blocks = this._blocks || (this._blocks = {});
        block = blocks[name] || (blocks[name] = []);
    block.push(options.fn(this));
  },
 
  encodeIdAttr: function (id) {
    return id && id.replace(/:| /g, "");
  },

  includes(str, substring, options) {
    console.log({str, substring});
    var len = substring.length;
    var pos = 0;
    var n = 0;

    while ((pos = str.indexOf(substring, pos)) > -1) {
      n++;
      pos += len;
    }
    return (n > 0) ? options.fn(this) : options.inverse(this);
  }
};

module.exports = function registerHelpers(hbs) {
  _.each(helpers, (fn, helper) => {
    hbs.registerHelper(helper, fn);
  });
};
