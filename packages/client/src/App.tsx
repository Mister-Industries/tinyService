import "./App.css";
import { Header } from "./components/header";
import { TestBench } from "./components/test-bench";

function App() {
  return (
    <div className="h-dvh w-dvw overflow-hidden">
      <Header />
      <div className="fixed top-12 h-[calc(100vh-3rem)] w-full overflow-y-auto bg-secondary dark:bg-background">
        <TestBench />
      </div>
    </div>
  );
}

export default App;
