type StreamingNarrationState = 'scanning' | 'in_narration' | 'done';

export class StreamingNarrationParser {
  private fullBuffer = '';
  private state: StreamingNarrationState = 'scanning';
  private escapeNext = false;

  push(delta: string): string[] {
    this.fullBuffer += delta;

    if (!delta || this.state === 'done') {
      return [];
    }

    if (this.state === 'scanning') {
      const marker = '"narration":"';
      const idx = this.fullBuffer.indexOf(marker);
      if (idx === -1) return [];

      this.state = 'in_narration';
      return this.extractTokens(this.fullBuffer.slice(idx + marker.length));
    }

    return this.extractTokens(delta);
  }

  getRawJson(): string {
    return this.fullBuffer;
  }

  isDone(): boolean {
    return this.state === 'done';
  }

  private extractTokens(text: string): string[] {
    const tokens: string[] = [];

    for (const ch of text) {
      if (this.state === 'done') break;

      if (this.escapeNext) {
        this.escapeNext = false;
        tokens.push(unescapeJsonNarrationChar(ch));
        continue;
      }

      if (ch === '\\') {
        this.escapeNext = true;
        continue;
      }

      if (ch === '"') {
        this.state = 'done';
        break;
      }

      tokens.push(ch);
    }

    return tokens;
  }
}

function unescapeJsonNarrationChar(ch: string): string {
  switch (ch) {
    case '"':
      return '"';
    case '\\':
      return '\\';
    case 'n':
      return '\n';
    case 't':
      return '\t';
    case 'r':
      return '\r';
    case 'b':
      return '\b';
    case 'f':
      return '\f';
    default:
      return ch;
  }
}
