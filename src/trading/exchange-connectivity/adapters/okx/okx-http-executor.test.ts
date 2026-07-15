import assert from "node:assert/strict";

import {
  FetchOkxRestTransportExecutor,
  OkxHttpExecutorError,
  createFetchOkxRestTransportExecutor,
  createFetchRequestInit,
  extractFetchHeaders,
  isAbortError,
  parseOkxHttpResponseBody,
  type OkxFetchHeaders,
  type OkxFetchLike,
  type OkxFetchResponse,
} from "./okx-http-executor";

import {
  createOkxPrivateRestRequest,
  createOkxPublicRestRequest,
} from "./okx-rest-contracts";

import {
  createOkxRestTransportRequest,
} from "./okx-rest-transport";

function createHeaders(
  values: Readonly<Record<string, string>>,
): OkxFetchHeaders {
  return {
    forEach(
      callback: (
        value: string,
        key: string,
      ) => void,
    ): void {
      for (const [key, value] of Object.entries(values)) {
        callback(value, key);
      }
    },
  };
}

function createResponse(
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): OkxFetchResponse {
  return {
    status,
    headers: createHeaders(headers),
    async text(): Promise<string> {
      return body;
    },
  };
}

function testFetchRequestInitForGet(): void {
  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/public/time",
  });

  const transportRequest = createOkxRestTransportRequest({
    url: "https://www.okx.com/api/v5/public/time",
    request,
    headers: {
      Accept: "application/json",
    },
    serializedBody: "",
    timeoutMs: 5_000,
  });

  const controller = new AbortController();

  const init = createFetchRequestInit(
    transportRequest,
    controller.signal,
  );

  assert.deepEqual(init, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
    signal: controller.signal,
  });

  assert.equal(Object.isFrozen(init), true);
  assert.equal(Object.isFrozen(init.headers), true);
}

function testFetchRequestInitForPost(): void {
  const body = {
    instId: "BTC-USDT",
    side: "buy",
  } as const;

  const request = createOkxPrivateRestRequest({
    method: "POST",
    path: "/api/v5/trade/order",
    body,
  });

  const serializedBody = JSON.stringify(body);

  const transportRequest = createOkxRestTransportRequest({
    url: "https://www.okx.com/api/v5/trade/order",
    request,
    headers: {},
    serializedBody,
    timeoutMs: 5_000,
  });

  const controller = new AbortController();

  const init = createFetchRequestInit(
    transportRequest,
    controller.signal,
  );

  assert.deepEqual(init, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: serializedBody,
    signal: controller.signal,
  });
}

function testExistingContentTypeIsPreserved(): void {
  const request = createOkxPrivateRestRequest({
    method: "POST",
    path: "/api/v5/trade/order",
    body: "{}",
  });

  const transportRequest = createOkxRestTransportRequest({
    url: "https://www.okx.com/api/v5/trade/order",
    request,
    headers: {
      "Content-Type": "application/custom+json",
    },
    serializedBody: "{}",
    timeoutMs: 5_000,
  });

  const controller = new AbortController();

  const init = createFetchRequestInit(
    transportRequest,
    controller.signal,
  );

  assert.equal(
    init.headers["content-type"],
    "application/custom+json",
  );
}

function testHeaderExtraction(): void {
  const headers = extractFetchHeaders(
    createHeaders({
      "Content-Type": "application/json",
      "X-Trace-ID": "trace-001",
    }),
  );

  assert.deepEqual(headers, {
    "content-type": "application/json",
    "x-trace-id": "trace-001",
  });

  assert.equal(Object.isFrozen(headers), true);
}

function testInvalidHeaderExtraction(): void {
  assert.throws(
    () =>
      extractFetchHeaders(
        {} as OkxFetchHeaders,
      ),
    /Fetch response headers must implement forEach/,
  );
}

function testJsonBodyParsing(): void {
  const payload = parseOkxHttpResponseBody(
    '{"code":"0","msg":"","data":[]}',
  );

  assert.deepEqual(payload, {
    code: "0",
    msg: "",
    data: [],
  });
}

function testEmptyBodyParsing(): void {
  const payload = parseOkxHttpResponseBody("   ");

  assert.deepEqual(payload, {
    code: "OKX_EMPTY_RESPONSE",
    msg: "OKX returned an empty response body.",
    data: [],
  });

  assert.equal(Object.isFrozen(payload), true);

  const record = payload as {
    readonly data: readonly unknown[];
  };

  assert.equal(Object.isFrozen(record.data), true);
}

function testInvalidJsonBodyParsing(): void {
  assert.throws(
    () => parseOkxHttpResponseBody("not-json"),
    (error: unknown) => {
      if (!(error instanceof OkxHttpExecutorError)) {
        return false;
      }

      assert.equal(
        error.message,
        "OKX REST response body was not valid JSON.",
      );

      assert.equal(error.retryable, false);
      assert.ok(error.cause instanceof Error);

      return true;
    },
  );
}

function testAbortErrorDetection(): void {
  assert.equal(isAbortError({ name: "AbortError" }), true);
  assert.equal(isAbortError({ code: "ABORT_ERR" }), true);
  assert.equal(isAbortError(new Error("network")), false);
  assert.equal(isAbortError(null), false);
}

async function testSuccessfulExecution(): Promise<void> {
  let capturedUrl = "";
  let capturedInit:
    | Parameters<OkxFetchLike>[1]
    | undefined;

  const fetchImplementation: OkxFetchLike =
    async (input, init): Promise<OkxFetchResponse> => {
      capturedUrl = input;
      capturedInit = init;

      return createResponse(
        200,
        '{"code":"0","msg":"","data":[{"ts":"1700000000000"}]}',
        {
          "Content-Type": "application/json",
          "X-Trace-ID": "trace-002",
        },
      );
    };

  const executor =
    new FetchOkxRestTransportExecutor({
      fetchImplementation,
    });

  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/public/time",
  });

  const transportRequest =
    createOkxRestTransportRequest({
      url:
        "https://www.okx.com/api/v5/public/time",
      request,
      headers: {
        Accept: "application/json",
      },
      serializedBody: "",
      timeoutMs: 1_000,
    });

  const response = await executor.execute(
    transportRequest,
  );

  assert.equal(
    capturedUrl,
    "https://www.okx.com/api/v5/public/time",
  );

  assert.ok(capturedInit);
  assert.equal(capturedInit.method, "GET");
  assert.equal(
    capturedInit.headers.accept,
    "application/json",
  );

  assert.deepEqual(response, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-trace-id": "trace-002",
    },
    body: {
      code: "0",
      msg: "",
      data: [
        {
          ts: "1700000000000",
        },
      ],
    },
  });

  assert.equal(Object.isFrozen(response), true);
  assert.equal(Object.isFrozen(response.headers), true);
}

async function testPostExecution(): Promise<void> {
  let capturedBody: string | undefined;

  const fetchImplementation: OkxFetchLike =
    async (_input, init): Promise<OkxFetchResponse> => {
      capturedBody = init.body;

      return createResponse(
        200,
        '{"code":"0","msg":"","data":[]}',
      );
    };

  const executor =
    createFetchOkxRestTransportExecutor({
      fetchImplementation,
    });

  const body = {
    instId: "BTC-USDT",
    side: "buy",
  } as const;

  const request = createOkxPrivateRestRequest({
    method: "POST",
    path: "/api/v5/trade/order",
    body,
  });

  await executor.execute(
    createOkxRestTransportRequest({
      url:
        "https://www.okx.com/api/v5/trade/order",
      request,
      headers: {},
      serializedBody: JSON.stringify(body),
      timeoutMs: 1_000,
    }),
  );

  assert.equal(
    capturedBody,
    JSON.stringify(body),
  );
}

async function testNetworkFailure(): Promise<void> {
  const sourceError = new Error("connection reset");

  const fetchImplementation: OkxFetchLike =
    async (): Promise<OkxFetchResponse> => {
      throw sourceError;
    };

  const executor =
    new FetchOkxRestTransportExecutor({
      fetchImplementation,
    });

  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/public/time",
  });

  await assert.rejects(
    () =>
      executor.execute(
        createOkxRestTransportRequest({
          url:
            "https://www.okx.com/api/v5/public/time",
          request,
          headers: {},
          serializedBody: "",
          timeoutMs: 1_000,
        }),
      ),
    (error: unknown) => {
      if (!(error instanceof OkxHttpExecutorError)) {
        return false;
      }

      assert.equal(
        error.message,
        "OKX REST network request failed: connection reset",
      );

      assert.equal(error.retryable, true);
      assert.equal(error.cause, sourceError);

      return true;
    },
  );
}

async function testAbortFailure(): Promise<void> {
  const fetchImplementation: OkxFetchLike =
    async (): Promise<OkxFetchResponse> => {
      const error = new Error("aborted");
      error.name = "AbortError";

      throw error;
    };

  const executor =
    new FetchOkxRestTransportExecutor({
      fetchImplementation,
    });

  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/public/time",
  });

  await assert.rejects(
    () =>
      executor.execute(
        createOkxRestTransportRequest({
          url:
            "https://www.okx.com/api/v5/public/time",
          request,
          headers: {},
          serializedBody: "",
          timeoutMs: 250,
        }),
      ),
    (error: unknown) => {
      if (!(error instanceof OkxHttpExecutorError)) {
        return false;
      }

      assert.equal(
        error.message,
        "OKX REST request timed out after 250ms.",
      );

      assert.equal(error.retryable, true);

      return true;
    },
  );
}

async function testRealTimeoutSignal(): Promise<void> {
  let signalWasAborted = false;

  const fetchImplementation: OkxFetchLike =
    async (_input, init): Promise<OkxFetchResponse> =>
      new Promise((_, reject) => {
        init.signal.addEventListener(
          "abort",
          () => {
            signalWasAborted = true;

            const error = new Error("aborted");
            error.name = "AbortError";

            reject(error);
          },
          {
            once: true,
          },
        );
      });

  const executor =
    new FetchOkxRestTransportExecutor({
      fetchImplementation,
    });

  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/public/time",
  });

  await assert.rejects(
    () =>
      executor.execute(
        createOkxRestTransportRequest({
          url:
            "https://www.okx.com/api/v5/public/time",
          request,
          headers: {},
          serializedBody: "",
          timeoutMs: 10,
        }),
      ),
    /OKX REST request timed out after 10ms/,
  );

  assert.equal(signalWasAborted, true);
}

async function testInvalidJsonExecution(): Promise<void> {
  const fetchImplementation: OkxFetchLike =
    async (): Promise<OkxFetchResponse> =>
      createResponse(
        200,
        "<html>bad gateway</html>",
      );

  const executor =
    new FetchOkxRestTransportExecutor({
      fetchImplementation,
    });

  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/public/time",
  });

  await assert.rejects(
    () =>
      executor.execute(
        createOkxRestTransportRequest({
          url:
            "https://www.okx.com/api/v5/public/time",
          request,
          headers: {},
          serializedBody: "",
          timeoutMs: 1_000,
        }),
      ),
    (error: unknown) => {
      if (!(error instanceof OkxHttpExecutorError)) {
        return false;
      }

      assert.equal(
        error.message,
        "OKX REST response body was not valid JSON.",
      );

      assert.equal(error.retryable, false);

      return true;
    },
  );
}

function testExecutorErrorIdentity(): void {
  const cause = new Error("cause");

  const error = new OkxHttpExecutorError(
    "Executor failure.",
    {
      retryable: true,
      cause,
    },
  );

  assert.equal(error.name, "OkxHttpExecutorError");
  assert.equal(
    error.code,
    "OKX_HTTP_EXECUTOR_ERROR",
  );

  assert.equal(error.message, "Executor failure.");
  assert.equal(error.retryable, true);
  assert.equal(error.cause, cause);

  assert.ok(error instanceof Error);
  assert.ok(error instanceof OkxHttpExecutorError);
}

async function testDeterministicExecution(): Promise<void> {
  const fetchImplementation: OkxFetchLike =
    async (): Promise<OkxFetchResponse> =>
      createResponse(
        200,
        '{"code":"0","msg":"","data":[{"value":"fixed"}]}',
        {
          "Content-Type": "application/json",
        },
      );

  const executor =
    new FetchOkxRestTransportExecutor({
      fetchImplementation,
    });

  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/public/time",
  });

  const transportRequest =
    createOkxRestTransportRequest({
      url:
        "https://www.okx.com/api/v5/public/time",
      request,
      headers: {},
      serializedBody: "",
      timeoutMs: 1_000,
    });

  const first = await executor.execute(
    transportRequest,
  );

  const second = await executor.execute(
    transportRequest,
  );

  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.headers, second.headers);
}

async function runOkxHttpExecutorTests(): Promise<void> {
  testFetchRequestInitForGet();
  testFetchRequestInitForPost();
  testExistingContentTypeIsPreserved();
  testHeaderExtraction();
  testInvalidHeaderExtraction();
  testJsonBodyParsing();
  testEmptyBodyParsing();
  testInvalidJsonBodyParsing();
  testAbortErrorDetection();
  await testSuccessfulExecution();
  await testPostExecution();
  await testNetworkFailure();
  await testAbortFailure();
  await testRealTimeoutSignal();
  await testInvalidJsonExecution();
  testExecutorErrorIdentity();
  await testDeterministicExecution();

  console.log(
    "All OKX HTTP executor tests passed successfully.",
  );
}

runOkxHttpExecutorTests().catch((error: unknown) => {
  console.error(
    "OKX HTTP executor tests failed.",
    error,
  );

  process.exitCode = 1;
});