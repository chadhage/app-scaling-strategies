'use strict';
// RED stub: exits 0 for everything. Replaced by the real CLI after the RED run is archived.
function main() {
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
