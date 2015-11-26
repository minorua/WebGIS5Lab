// gsielevtile.js
// (C) 2015 Minoru Akagi | MIT License
// https://github.com/minorua/WebGISLab
// Dependencies: jQuery

(function () {
  var TILE_SIZE = 256;
  var TSIZE1 = 20037508.342789244;
  var NODATA_VALUE = 0;
  var ZMAX = 14;

  var DEMBlocks = function (zoom, xmin, ymin, xmax, ymax) {
    this.tileSize = TSIZE1 / Math.pow(2, zoom - 1);
    this.tileRange = [xmin, ymin, xmax, ymax];

    this.extent = [
      xmin * this.tileSize - TSIZE1, TSIZE1 - (ymax + 1) * this.tileSize,
      (xmax + 1) * this.tileSize - TSIZE1, TSIZE1 - ymin * this.tileSize
    ];
    this.cols = xmax - xmin + 1;
    this.rows = ymax - ymin + 1;
    this.cellSize = this.tileSize / TILE_SIZE;

    this.blocks = [];
  };

  DEMBlocks.prototype = {

    constructor: DEMBlocks,

    set: function (x, y, data) {
      this.blocks[(x - this.tileRange[0]) + (y - this.tileRange[1]) * this.cols] = data;
    },

    // nx, ny: number of grid points
    read: function (extent, nx, ny) {
      var width = extent[2] - extent[0],
          height = extent[3] - extent[1];
      var xres = width / (nx - 1),
          yres = height / (ny - 1);

      var vals = [];
      for (var y = 0; y < ny; y++) {
        for (var x = 0; x < nx; x++) {
          var pt = [extent[0] + x * xres, extent[3] - y * yres];

          // TODO: bilinear interpolation
          // this.value = function (pt)
          var xi = (pt[0] - this.extent[0]) / this.cellSize,
              yi = (this.extent[3] - pt[1]) / this.cellSize;

          var ti = parseInt(xi / TILE_SIZE) + parseInt(yi / TILE_SIZE) * this.cols;
          if (this.blocks[ti] === undefined) vals.push(0);
          else {
            vals.push(this.blocks[ti][parseInt(xi % TILE_SIZE) + parseInt(yi % TILE_SIZE) * TILE_SIZE] || NODATA_VALUE);
          }
        }
      }
      return vals;
    }

  };

  // olapp.demProvider.GSIElevTile
  if (olapp.demProvider === undefined) olapp.demProvider = {};
  olapp.demProvider.GSIElevTile = function () {
    this.urlTmpl = 'http://cyberjapandata.gsi.go.jp/xyz/dem/{z}/{x}/{y}.txt';
  };

  olapp.demProvider.GSIElevTile.prototype = {

    constructor: olapp.demProvider.GSIElevTile,

    readBlock: function (extent, width, height, projection) {
      var merc_rect = extent;   // TODO: reprojection support
      // if (!boundingbox.intersects(merc_rect)) return Array.apply(null, Array(width * height)).map(function (_, i) { return NODATA_VALUE; }

      var over_smpl = 1;
      var segments_x = (width == 1) ? 1 : width - 1;
      var res = (extent[2] - extent[0]) / segments_x / over_smpl;

      var d = new $.Deferred();
      this.getBlocks(merc_rect, res).then(function (blocks) {
        d.resolve(blocks.read(merc_rect, width, height));
      });
      return d.promise();
    },

    getValue: function (coords, zoom, projection) {
      // $.Deferred
    },

    getBlocks: function (extent, mapUnitsPerPixel) {
      // Calculate zoom level
      var mpp1 = TSIZE1 / TILE_SIZE;
      var zoom = Math.ceil(Math.LOG2E * Math.log(mpp1 / mapUnitsPerPixel) + 1);
      zoom = Math.max(0, Math.min(zoom, ZMAX));

      // Calculate tile range (yOrigin is top)
      var tileSize = TSIZE1 / Math.pow(2, zoom - 1);
      var matrixSize = Math.pow(2, zoom);
      var ulx = Math.max(0, parseInt((extent[0] + TSIZE1) / tileSize)),
          uly = Math.max(0, parseInt((TSIZE1 - extent[3]) / tileSize)),
          lrx = Math.min(parseInt((extent[2] + TSIZE1) / tileSize), matrixSize - 1),
          lry = Math.min(parseInt((TSIZE1 - extent[1]) / tileSize), matrixSize - 1);

      // download count limit
      if ((lrx - ulx + 1) * (lry - uly + 1) > 128) {
        console.log('Number of tiles to fetch is too large!');
        return null;
      }

      return this.fetchFiles(zoom, ulx, uly, lrx, lry);
    },

    fetchFiles: function (zoom, xmin, ymin, xmax, ymax) {
      var blocks = new DEMBlocks(zoom, xmin, ymin, xmax, ymax);
      var tiles = [];
      for (var y = ymin; y <= ymax; y++) {
        for (var x = xmin; x <= xmax; x++) {
          tiles.push({
            x: x,
            y: y,
            url: this.urlTmpl.replace('{x}', x).replace('{y}', y).replace('{z}', zoom)
          });
        }
      }

      var gets = [];
      tiles.forEach(function (tile) {
        gets.push($.get(tile.url, function (data) {
          var vals = data.replace(/\n/g, ',').split(',');
          for (var i = 0, l = vals.length; i < l; i++) {
            vals[i] = parseFloat(vals[i]) || 0;
          }
          blocks.set(tile.x, tile.y, vals);
        }));
      });

      var d = new $.Deferred();
      $.when.apply(this, gets).then(function () {
        d.resolve(blocks);
      });
      return d.promise();
    }

  };

})();