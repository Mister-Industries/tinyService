import { Circle, RefreshCcw } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { addLog } from "../store/slices/testBenchSlice";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { Button } from "./ui/button";

const ICONS = {
  active: <Circle size={12} className="text-green-500 fill-green-500" />,
  installed: <Circle size={12} className="text-blue-500 fill-blue-500" />,
  missing: <Circle size={12} className="text-red-500" />,
};

export function BoardManager(): React.JSX.Element {
  const dispatch = useAppDispatch();
  const { client, connected, boards, selectedBoard } = useAppSelector(
    (state) => state.testBench,
  );

  const handleRefresh = () => {
    if (client && connected) {
      dispatch(
        addLog({
          type: "info",
          message: "Refreshing board list...",
        }),
      );
      client.listBoards();
    } else {
      dispatch(
        addLog({
          type: "warning",
          message: "Cannot refresh: Not connected to service",
        }),
      );
    }
  };

  const getBoardIcon = (fqbn: string) => {
    // Check if this board is the selected tinyCore board
    if (selectedBoard && selectedBoard.fqbn === fqbn) {
      return ICONS.active;
    }
    // If board is detected (in the list), it's installed
    return ICONS.installed;
  };

  return (
    <div className="size-full overflow-none bg-background text-foreground flex flex-col group">
      <div className="flex justify-between items-center p-2 border-b">
        <h2 className="text-lg font-semibold">Board Manager</h2>
        <Button
          size="icon-sm"
          variant="ghost"
          className="opacity-50 hover:opacity-100"
          onClick={handleRefresh}
          disabled={!connected}
        >
          <RefreshCcw
            size={18}
            className={`opacity-0 group-hover:opacity-100 ${
              !connected ? "cursor-not-allowed" : ""
            }`}
          />
        </Button>
      </div>
      <div className="size-full flex-col overflow-y-auto">
        {!connected ? (
          <div className="p-4 text-center text-muted-foreground">
            <p>Not connected to TinyService</p>
            <p className="text-sm mt-2">Waiting for connection...</p>
          </div>
        ) : boards.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <p>No boards detected</p>
            <p className="text-sm mt-2">Connect a board and click refresh</p>
          </div>
        ) : (
          <Accordion type="multiple">
            {boards.map((board, index) => (
              <AccordionItem
                key={`${board.fqbn}-${index}`}
                value={`item-${index}`}
              >
                <AccordionTrigger className="px-2">
                  <div className="flex gap-2 items-center">
                    {getBoardIcon(board.fqbn)} {board.name}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-2 space-y-1">
                  <div className="text-sm">
                    <span className="font-semibold">FQBN:</span>{" "}
                    <span className="text-muted-foreground font-mono text-xs">
                      {board.fqbn}
                    </span>
                  </div>
                  {board.port && (
                    <div className="text-sm">
                      <span className="font-semibold">Port:</span>{" "}
                      <span className="text-muted-foreground">
                        {board.port}
                      </span>
                    </div>
                  )}
                  {selectedBoard && selectedBoard.fqbn === board.fqbn && (
                    <div className="text-xs text-green-600 font-semibold mt-2">
                      ✓ Currently selected
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}
