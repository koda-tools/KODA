import { Box, ToolCall } from "@termuijs/widgets";
import type { ToolCallHandle, ToolCallView } from "../shared/types.js";
import { LAYOUT } from "./constants.js";

/**
 * Hosts the active TermUI `ToolCall` (https://www.termui.io/components/tool-call).
 * `ToolCall` has no setters for name/args, so each call mounts a new widget.
 */
export class ToolSlot {
  public readonly widget = new Box({ height: 0 });

  public show(call: ToolCallView): ToolCallHandle {
    const toolCall = new ToolCall(
      { name: call.name, args: { ...call.args }, status: "pending" },
      { height: LAYOUT.toolSlotExpandedHeight, border: "single" },
    );
    this.widget.clearChildren();
    this.widget.addChild(toolCall);
    this.widget.setStyle({ height: LAYOUT.toolSlotExpandedHeight });
    return {
      setStatus: (status, result) => {
        toolCall.setStatus(status);
        if (result !== undefined) toolCall.setResult(result);
      },
      dispose: () => {
        if (this.widget.children.includes(toolCall)) this.hide();
      },
    };
  }

  public hide(): void {
    this.widget.clearChildren();
    this.widget.setStyle({ height: 0 });
  }
}
