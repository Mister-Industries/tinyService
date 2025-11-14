import { SendHorizonal, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { clearLogs, clearOutput } from "../store/slices/testBenchSlice";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

export function OutputTerminal(): React.JSX.Element {
  const dispatch = useAppDispatch();
  const { logs, output } = useAppSelector((state) => state.testBench);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  const formatTimestamp = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case "error":
        return "text-red-500";
      case "success":
        return "text-green-500";
      case "warning":
        return "text-yellow-500";
      default:
        return "text-foreground";
    }
  };

  return (
    <div className="size-full overflow-none bg-background text-foreground flex flex-col p-2">
      <Tabs defaultValue="logs" className="size-full flex flex-col">
        <TabsList>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="serial">Serial Monitor</TabsTrigger>
        </TabsList>

        <TabsContent
          value="logs"
          className="h-[calc(100%-2rem)] w-full bg-secondary text-secondary-foreground border rounded-md p-2 font-mono text-sm relative"
        >
          <Button
            size="icon-sm"
            variant="ghost"
            className="absolute top-2 right-2 opacity-50 hover:opacity-100"
            onClick={() => dispatch(clearLogs())}
            title="Clear logs"
          >
            <Trash2 size={16} />
          </Button>

          {logs.length === 0 ? (
            <div className="text-muted-foreground text-center mt-4">
              No logs yet. Connect to the service to begin.
            </div>
          ) : (
            <ScrollArea className="h-full">
              {logs.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-muted-foreground text-xs">
                    [{formatTimestamp(log.timestamp)}]
                  </span>
                  {log.action && (
                    <span className="text-blue-400 text-xs">
                      [{log.action}]
                    </span>
                  )}
                  <span className={getLogColor(log.type)}>{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent
          value="output"
          className="flex-1 w-full bg-secondary text-secondary-foreground border rounded-md p-2 overflow-y-auto font-mono text-sm relative"
        >
          <Button
            size="icon-sm"
            variant="ghost"
            className="absolute top-2 right-2 opacity-50 hover:opacity-100"
            onClick={() => dispatch(clearOutput())}
            title="Clear output"
          >
            <Trash2 size={16} />
          </Button>

          {output.length === 0 ? (
            <div className="text-muted-foreground text-center mt-4">
              No output yet. Compile or upload a sketch to see Arduino CLI
              output.
            </div>
          ) : (
            <div className="space-y-0.5 whitespace-pre-wrap">
              {output.map((line, index) => (
                <div key={index}>{line}</div>
              ))}
              <div ref={outputEndRef} />
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="serial"
          className="flex-1 relative w-full bg-secondary text-secondary-foreground border rounded-md p-2 overflow-y-auto"
        >
          <div className="text-muted-foreground text-center mt-4">
            Serial monitor coming soon...
          </div>
          <div className="absolute bottom-2 left-2 right-2 w-[calc(100%-1rem)] flex gap-2">
            <Input
              placeholder="Type here to send data to the serial monitor"
              disabled
            />
            <Button className="bg-blue-600" disabled>
              <SendHorizonal /> Send
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
