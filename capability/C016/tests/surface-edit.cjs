'use strict';

// U019: the one-line K-C015 pin edit of C015 tests\surface.test.cjs (capability\C015\K-C015.md, pending publication). The check at line 70
// reads the archived approved publisher snapshot named by publisher-boundary.json instead of the live private publisher. The anchor is the
// exact accepted line with its CRLF ending, so any other layout of the file is refused instead of edited.
const FILE = 'capability\\C015\\tests\\surface.test.cjs';
const BEFORE = "  const bytes = fs.readFileSync(path.resolve(root, '..', '..', boundary.standardPublisher));";
const AFTER = "  const bytes = fs.readFileSync(path.join(root, 'evidence', boundary.approvedSourceSnapshot));";

function applySurfaceEdit(bytes) {
  const anchor = `${BEFORE}\r\n`;
  const source = bytes.toString('utf8');
  if (source.split(anchor).length !== 2) {
    throw Object.assign(new Error('SURFACE_EDIT_ANCHOR: the accepted line must occur exactly once with a CRLF line ending'), { code: 'SURFACE_EDIT_ANCHOR' });
  }
  return Buffer.from(source.replace(anchor, () => `${AFTER}\r\n`));
}

module.exports = Object.freeze({ FILE, BEFORE, AFTER, applySurfaceEdit });
