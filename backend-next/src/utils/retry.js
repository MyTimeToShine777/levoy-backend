'use strict';

// Tries `attempt` again when the storage service has a short hiccup (a 5xx answer such as "503 ServiceUnavailable", or a dropped
// connection with no answer at all). Any other error (wrong key, access denied, bad request) is thrown straight away,
// because trying again cannot fix it.
//
// `attempt` is a function, not a ready-made request, on purpose: a file stream can only be sent once, so every try
// has to open the file again. (The AWS library cannot retry a stream by itself, which is why it logs
// "non-retryable streaming request".)
async function retryOnServerError(attempt, { tries = 3, waitMs = 1000 } = {}) {
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (e) {
      const status = e && e.$metadata && e.$metadata.httpStatusCode;
      const worthRetrying = status === undefined || status >= 500;
      if (n >= tries || !worthRetrying) throw e;
      await new Promise(resolve => setTimeout(resolve, waitMs * n));
    }
  }
}

module.exports = { retryOnServerError };
