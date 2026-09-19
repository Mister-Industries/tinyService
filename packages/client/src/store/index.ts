import { configureStore } from "@reduxjs/toolkit";
import testBenchReducer from "./slices/testBenchSlice";

export const store = configureStore({
  reducer: {
    testBench: testBenchReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types for non-serializable values
        ignoredActions: ["testBench/setClient"],
        // Ignore these paths in the state
        ignoredPaths: ["testBench.client"],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
