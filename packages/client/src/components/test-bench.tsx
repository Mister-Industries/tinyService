import type { OutgoingMessage } from "@mister-industries/shared";
import { TinyServiceClient } from "@mister-industries/shared";
import { useCallback, useEffect } from "react";
import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_INTERVAL,
  WS_URL,
} from "../config/constants";
import { useAppDispatch } from "../store/hooks";
import {
  addLog,
  addOutput,
  setBoards,
  setClient,
  setConnected,
  updateTestStatus,
} from "../store/slices/testBenchSlice";
import { BoardManager } from "./board-manager";
import { OutputTerminal } from "./output-terminal";
import { TestChecklist } from "./test-checklist";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./ui/resizable";

export function TestBench(): React.JSX.Element {
  const dispatch = useAppDispatch();

  const handleMessage = useCallback(
    (message: OutgoingMessage) => {
      const { type, action, data } = message;

      switch (type) {
        case "status":
          dispatch(
            addLog({
              type: "info",
              action,
              message: data.message,
            })
          );
          break;

        case "output":
          dispatch(addOutput(data.output));
          break;

        case "error":
          dispatch(
            addLog({
              type: "error",
              action,
              message: `Error: ${data.error}`,
            })
          );

          // Update test status based on action
          if (action === "compile") {
            dispatch(
              updateTestStatus({ step: "sketchCompiled", status: "fail" })
            );
          } else if (action === "upload") {
            dispatch(
              updateTestStatus({ step: "sketchUploaded", status: "fail" })
            );
          } else if (action === "install-cores") {
            dispatch(
              updateTestStatus({ step: "tinyCoreInstalled", status: "fail" })
            );
          }
          break;
        case "complete":
          dispatch(
            addLog({
              type: data.success ? "success" : "error",
              action,
              message: data.message,
            })
          );

          if (data.output) {
            dispatch(addOutput(data.output));
          }

          // Handle list-boards response
          if (action === "list-boards" && data.boards) {
            dispatch(setBoards(data.boards));

            // Check if Arduino CLI is working
            dispatch(
              updateTestStatus({ step: "arduinoCliDetected", status: "pass" })
            );

            // Check if tinyCore is detected
            const hasTinyCore = data.boards.some((board: { fqbn: string }) =>
              board.fqbn.startsWith("tinyCore:")
            );
            if (hasTinyCore) {
              dispatch(
                updateTestStatus({ step: "tinyCoreDetected", status: "pass" })
              );
            }
          }

          // Handle install-cores response
          if (action === "install-cores") {
            dispatch(
              updateTestStatus({
                step: "tinyCoreInstalled",
                status: data.success ? "pass" : "fail",
              })
            );
          }

          // Handle compile response
          if (action === "compile") {
            dispatch(
              updateTestStatus({
                step: "sketchCompiled",
                status: data.success ? "pass" : "fail",
              })
            );
          }

          // Handle upload response
          if (action === "upload") {
            dispatch(
              updateTestStatus({
                step: "sketchUploaded",
                status: data.success ? "pass" : "fail",
              })
            );
          }
          break;
      }
    },
    [dispatch]
  );

  useEffect(() => {
    // Initialize WebSocket client
    const wsClient = new TinyServiceClient({
      url: WS_URL,
      autoReconnect: true,
      reconnectInterval: RECONNECT_INTERVAL,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      debug: true,
    });

    // Set up event handlers
    wsClient.onConnect(() => {
      dispatch(setConnected(true));
      dispatch(
        addLog({ type: "success", message: "Connected to TinyService" })
      );

      // Request board list on connect
      wsClient.listBoards();
    });

    wsClient.onDisconnect(() => {
      dispatch(setConnected(false));
      dispatch(
        addLog({ type: "warning", message: "Disconnected from TinyService" })
      );
    });

    wsClient.onMessage((message: OutgoingMessage) => {
      handleMessage(message);
    });

    wsClient.onError((error) => {
      const errorMsg = typeof error === "string" ? error : error.message;
      dispatch(
        addLog({ type: "error", message: `WebSocket error: ${errorMsg}` })
      );
    });

    dispatch(setClient(wsClient));

    // Connect
    wsClient.connect();

    // Cleanup on unmount
    return () => {
      wsClient.disconnect();
    };
  }, [dispatch, handleMessage]);

  return (
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel defaultSize={20} minSize={5}>
        <BoardManager />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={80}>
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel defaultSize={50}>
            <TestChecklist />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={50} minSize={5}>
            <OutputTerminal />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
