import {
  EmployerResolveRequestMessage,
  EmployerResponseMessage,
  EmployerSignalsRequestMessage,
  LOCAL_PROXY_ORIGIN,
  ScoreRequestMessage,
  ScoreResponseMessage,
  isEmployerResolveRequestMessage,
  isEmployerSignalsRequestMessage,
  isScoreRequestMessage,
  isTrustedExtensionSender,
} from "./messages";
import { scoreLocation } from "./scoring/location_scoring";
import { APP_LOG_PREFIX } from "./ui/brand";

chrome.runtime.onInstalled.addListener(() => {
  console.debug(`${APP_LOG_PREFIX} Service worker installed`);
});

async function handleScoreRequest(message: ScoreRequestMessage): Promise<ScoreResponseMessage> {
  const { requestId, locationName, settings } = message;
  return {
    type: "score_response",
    requestId,
    result: await scoreLocation(locationName, settings),
  };
}

async function handleEmployerRequest(
  message: EmployerResolveRequestMessage | EmployerSignalsRequestMessage,
): Promise<EmployerResponseMessage> {
  try {
    const url = new URL(
      message.type === "employer_resolve_request"
        ? "/api/employer/resolve"
        : "/api/employer/signals",
      LOCAL_PROXY_ORIGIN,
    );
    if (message.type === "employer_resolve_request") {
      url.searchParams.set("name", message.name);
      if (message.hintLocation) {
        url.searchParams.set("hint_location", message.hintLocation);
      }
    } else {
      url.searchParams.set("company_number", message.companyNumber);
      if (message.companyName) {
        url.searchParams.set("company_name", message.companyName);
      }
    }

    const response = await fetch(url);
    if (!response.ok) {
      return {
        type: "employer_response",
        ok: false,
        status: response.status,
        error: response.statusText || `Request failed with ${response.status}`,
      };
    }
    return {
      type: "employer_response",
      ok: true,
      status: response.status,
      data: await response.json(),
    };
  } catch (error) {
    return {
      type: "employer_response",
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Fetch failed",
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isTrustedExtensionSender(sender)) {
    return;
  }

  if (isScoreRequestMessage(message)) {
    void handleScoreRequest(message)
      .then(sendResponse)
      .catch((error) => {
        console.error(`${APP_LOG_PREFIX} Score failed`, error);
        const response: ScoreResponseMessage = {
          type: "score_response",
          requestId: message.requestId,
          result: { status: "unknown", reason: "Score failed" },
        };
        sendResponse(response);
      });

    return true;
  }

  if (isEmployerResolveRequestMessage(message) || isEmployerSignalsRequestMessage(message)) {
    void handleEmployerRequest(message)
      .then(sendResponse)
      .catch((error) => {
        console.error(`${APP_LOG_PREFIX} Employer request failed`, error);
        const response: EmployerResponseMessage = {
          type: "employer_response",
          ok: false,
          status: 0,
          error: "Fetch failed",
        };
        sendResponse(response);
      });

    return true;
  }
});
