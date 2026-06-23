import type { BoardInfo } from "@mister-industries/shared";
import { TinyServiceClient } from "@mister-industries/shared";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

export type TestStatus = "pass" | "fail" | "queued" | "running";

export interface TestStepStatus {
  arduinoCliDetected: TestStatus;
  tinyCoreInstalled: TestStatus;
  tinyCoreDetected: TestStatus;
  sketchFound: TestStatus;
  sketchCompiled: TestStatus;
  sketchUploaded: TestStatus;
}

export interface LogEntry {
  timestamp: string; // ISO string for serialization
  type: "info" | "error" | "success" | "warning";
  action?: string;
  message: string;
}

export interface TestBenchState {
  client: TinyServiceClient | null;
  connected: boolean;
  boards: BoardInfo[];
  selectedBoard: BoardInfo | null;
  testStatus: TestStepStatus;
  isTestRunning: boolean;
  logs: LogEntry[];
  output: string[];
}

const initialState: TestBenchState = {
  client: null,
  connected: false,
  boards: [],
  selectedBoard: null,
  testStatus: {
    arduinoCliDetected: "queued",
    tinyCoreInstalled: "queued",
    tinyCoreDetected: "queued",
    sketchFound: "queued",
    sketchCompiled: "queued",
    sketchUploaded: "queued",
  },
  isTestRunning: false,
  logs: [],
  output: [],
};

const testBenchSlice = createSlice({
  name: "testBench",
  initialState,
  reducers: {
    setClient: (state, action: PayloadAction<TinyServiceClient | null>) => {
      state.client = action.payload;
    },
    setConnected: (state, action: PayloadAction<boolean>) => {
      state.connected = action.payload;
    },
    setBoards: (state, action: PayloadAction<BoardInfo[]>) => {
      state.boards = action.payload;

      // Auto-detect tinyCore board
      const tinyCore = action.payload.find((board) =>
        board.fqbn.startsWith("tinyCore:"),
      );
      if (tinyCore && !state.selectedBoard) {
        state.selectedBoard = tinyCore;
      }
    },
    setSelectedBoard: (state, action: PayloadAction<BoardInfo | null>) => {
      state.selectedBoard = action.payload;
    },
    updateTestStatus: (
      state,
      action: PayloadAction<{ step: keyof TestStepStatus; status: TestStatus }>,
    ) => {
      state.testStatus[action.payload.step] = action.payload.status;
    },
    setTestRunning: (state, action: PayloadAction<boolean>) => {
      state.isTestRunning = action.payload;
    },
    addLog: (state, action: PayloadAction<Omit<LogEntry, "timestamp">>) => {
      state.logs.push({
        ...action.payload,
        timestamp: new Date().toISOString(),
      });
    },
    addOutput: (state, action: PayloadAction<string>) => {
      state.output.push(action.payload);
    },
    clearLogs: (state) => {
      state.logs = [];
    },
    clearOutput: (state) => {
      state.output = [];
    },
    resetTestStatus: (state) => {
      state.testStatus = initialState.testStatus;
      state.isTestRunning = false;
    },
    resetAll: (state) => {
      state.boards = [];
      state.selectedBoard = null;
      state.testStatus = initialState.testStatus;
      state.isTestRunning = false;
      state.logs = [];
      state.output = [];
    },
  },
});

export const {
  setClient,
  setConnected,
  setBoards,
  setSelectedBoard,
  updateTestStatus,
  setTestRunning,
  addLog,
  addOutput,
  clearLogs,
  clearOutput,
  resetTestStatus,
  resetAll,
} = testBenchSlice.actions;

export default testBenchSlice.reducer;
