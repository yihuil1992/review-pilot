import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("keeps Nest's multipart parser alive when an async filter finishes after teardown", () => {
  const requireFromApi = createRequire(import.meta.url);
  const requireFromNest = createRequire(requireFromApi.resolve("@nestjs/platform-express/package.json"));
  const multerPath = requireFromNest.resolve("multer");
  // Exercise the dependency Nest actually loads in a child process: an uncaught
  // stream error must fail this test instead of terminating the Vitest worker.
  // Regression scenario: GHSA-q7qp-rjg7-q26m, pending filter + truncated form.
  const result = spawnSync(process.execPath, ["-e", `
    const assert = require('node:assert/strict');
    const request = new (require('node:stream').PassThrough)();
    const multer = require(${JSON.stringify(multerPath)});
    const rejected = new Error('synthetic rejection');
    let finishFirst, parser, callbacks = 0;
    const timer = setTimeout(() => process.exit(2), 3000);
    const payload = ['first', 'second'].map(name =>
      '--test-boundary\\r\\nContent-Disposition: form-data; name="'+name+'"; filename="test.txt"\\r\\nContent-Type: text/plain\\r\\n\\r\\nx'
    ).join('\\r\\n');
    request.headers = {'content-type': 'multipart/form-data; boundary=test-boundary', 'content-length': Buffer.byteLength(payload)};
    multer({
      fileHwm: 1,
      streamHandler(req, stream) { parser = stream; req.pipe(stream); },
      fileFilter(req, file, callback) {
        if (file.fieldname === 'first') finishFirst = callback;
        else req.once('end', () => setImmediate(() => callback(rejected)));
      }
    }).any()(request, null, error => {
      assert.equal(++callbacks, 1);
      assert.equal(error, rejected);
      setImmediate(() => {
        parser.once('close', () => {
          assert.equal(callbacks, 1);
          assert.deepEqual(request.files, []);
          clearTimeout(timer);
          console.log('teardown-complete');
        });
        finishFirst(null, true);
      });
    });
    request.end(payload);
  `], { encoding: "utf8", timeout: 5000 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("teardown-complete");
});
