import type {
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedElementNode,
  Spread,
} from "lexical";
import { $createTextNode, ElementNode } from "lexical";

export type CodeFenceRole = "close" | "open";

export type SerializedCodeFenceNode = Spread<
  {
    active: boolean;
    role: CodeFenceRole;
    type: "code-fence";
    version: 1;
  },
  SerializedElementNode
>;

const getCodeFenceClassName = (role: CodeFenceRole, isActive: boolean): string => {
  return [
    "my-0 block w-full overflow-x-auto bg-zinc-50 px-4 font-mono text-sm leading-6 text-zinc-800",
    "whitespace-pre-wrap empty:before:content-['\\200b']",
    role === "open" ? "rounded-t-xl pt-3 pb-1" : "rounded-b-xl pt-1 pb-3",
    isActive ? "block" : "hidden",
  ].join(" ");
};

export class CodeFenceNode extends ElementNode {
  __role: CodeFenceRole;
  __active: boolean;

  static getType(): string {
    return "code-fence";
  }

  static clone(node: CodeFenceNode): CodeFenceNode {
    return new CodeFenceNode(node.__role, node.__active, node.__key);
  }

  static importJSON(serializedNode: SerializedCodeFenceNode): CodeFenceNode {
    return new CodeFenceNode(serializedNode.role, serializedNode.active).updateFromJSON(
      serializedNode,
    );
  }

  constructor(role: CodeFenceRole = "open", active = false, key?: NodeKey) {
    super(key);
    this.__role = role;
    this.__active = active;
  }

  afterCloneFrom(prevNode: this): void {
    super.afterCloneFrom(prevNode);
    this.__role = prevNode.__role;
    this.__active = prevNode.__active;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("p");
    element.className = getCodeFenceClassName(this.__role, this.__active);
    element.setAttribute("data-code-fence", this.__role);
    element.setAttribute("spellcheck", "false");
    return element;
  }

  updateDOM(prevNode: CodeFenceNode, dom: HTMLElement, _config: EditorConfig): boolean {
    if (prevNode.__active !== this.__active || prevNode.__role !== this.__role) {
      dom.className = getCodeFenceClassName(this.__role, this.__active);
      dom.setAttribute("data-code-fence", this.__role);
    }

    return false;
  }

  exportJSON(): SerializedCodeFenceNode {
    return {
      ...super.exportJSON(),
      active: this.__active,
      role: this.__role,
      type: "code-fence",
      version: 1,
    };
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedCodeFenceNode>): this {
    super.updateFromJSON(serializedNode);
    return this.setActive(serializedNode.active).setRole(serializedNode.role);
  }

  getRole(): CodeFenceRole {
    return this.getLatest().__role;
  }

  setRole(role: CodeFenceRole): this {
    if (this.getLatest().__role === role) {
      return this;
    }

    const self = this.getWritable();
    self.__role = role;
    return self;
  }

  isActive(): boolean {
    return this.getLatest().__active;
  }

  setActive(isActive: boolean): this {
    if (this.getLatest().__active === isActive) {
      return this;
    }

    const self = this.getWritable();
    self.__active = isActive;
    return self;
  }
}

export const $createCodeFenceNode = (role: CodeFenceRole, text: string): CodeFenceNode => {
  const node = new CodeFenceNode(role);
  node.append($createTextNode(text));
  return node;
};

export const $isCodeFenceNode = (node: LexicalNode | null | undefined): node is CodeFenceNode => {
  return node instanceof CodeFenceNode;
};
