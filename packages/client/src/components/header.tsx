import { TriangleAlert } from "lucide-react";
import { Button } from "./ui/button";

export function Header(): React.JSX.Element {
  const handleHardReset = (): void => {
    // Implement hard reset logic here
    // uninstall all libraries
    // uninstall all boards
    // clear all settings
    console.log("Hard Reset triggered");
  };

  return (
    <div className="fixed top-0 left-0 h-12 flex items-center justify-between px-4 border-b w-full">
      <h1 className="text-2xl font-semibold">
        tiny<span className="font-bold text-blue-400">Service</span> Test Bench
      </h1>
      <div className="flex gap-2">
        <Button variant="destructive" onClick={handleHardReset}>
          <TriangleAlert /> Hard Reset
        </Button>
      </div>
    </div>
  );
}
