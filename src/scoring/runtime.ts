import type {
  ScoreRequestMessage,
  ScoreResponseMessage,
  SearchScoreRequestMessage,
  SearchScoreResponseMessage,
} from "../messages";
import type { ProxyJob, ScoredJob } from "../search/types";
import type { Settings } from "../storage/settings";
import type { GeocodeResult, ScoreResult } from "./types";

type RuntimeRequest = ScoreRequestMessage | SearchScoreRequestMessage;
type RuntimeResponse = ScoreResponseMessage | SearchScoreResponseMessage;
type SendMessage = (
  message: RuntimeRequest,
  callback: (response: RuntimeResponse | undefined) => void,
) => void;

export type RuntimeScoringDependencies = {
  sendMessage?: SendMessage;
  createRequestId?: () => string;
  getLastError?: () => { message?: string } | undefined;
};

function sendRuntimeRequest<T extends RuntimeResponse>(
  request: RuntimeRequest,
  responseType: T["type"],
  deps: RuntimeScoringDependencies,
): Promise<T> {
  const sendMessage = deps.sendMessage ?? chrome.runtime.sendMessage;
  const getLastError = deps.getLastError ?? (() => chrome.runtime.lastError);
  return new Promise((resolve, reject) => {
    sendMessage(request, (response) => {
      const lastError = getLastError();
      if (lastError) {
        reject(new Error(lastError.message || "Unable to reach the service worker"));
        return;
      }
      if (
        !response ||
        response.type !== responseType ||
        response.requestId !== request.requestId
      ) {
        reject(new Error("Invalid service-worker scoring response"));
        return;
      }
      resolve(response as T);
    });
  });
}

export async function scoreLocationViaRuntime(
  locationName: string,
  settings: Settings,
  deps: RuntimeScoringDependencies = {},
): Promise<ScoreResult> {
  const requestId = (deps.createRequestId ?? (() => crypto.randomUUID()))();
  const response = await sendRuntimeRequest<ScoreResponseMessage>(
    { type: "score_request", requestId, locationName, settings },
    "score_response",
    deps,
  );
  return response.result;
}

export async function scoreSearchJobsViaRuntime(
  jobs: ProxyJob[],
  settings: Settings,
  home: GeocodeResult | null,
  remoteOverride: boolean,
  deps: RuntimeScoringDependencies = {},
): Promise<ScoredJob[]> {
  const requestId = (deps.createRequestId ?? (() => crypto.randomUUID()))();
  const response = await sendRuntimeRequest<SearchScoreResponseMessage>(
    { type: "search_score_request", requestId, jobs, settings, home, remoteOverride },
    "search_score_response",
    deps,
  );
  if (!response.results || response.error) {
    throw new Error(response.error || "Service worker returned no search scores");
  }
  return response.results;
}
