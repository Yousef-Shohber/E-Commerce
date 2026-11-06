import * as net from 'node:net';

export type SinkMessage = {
  from: string;
  to: string[];
  raw: string;
  text: string;
};

function decodeQuotedPrintable(value: string) {
  return value
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_m, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

/**
 * A tiny REAL SMTP server (it speaks SMTP over a TCP socket) that keeps every
 * message it receives, so tests can read the verification / reset links.
 */
export class SmtpSink {
  public messages: SinkMessage[] = [];
  private server?: net.Server;

  public start(port: number) {
    this.server = net.createServer((socket) => {
      let inData = false;
      let from = '';
      let to: string[] = [];
      let buffer = '';

      socket.write('220 sink ESMTP\r\n');
      socket.on('error', () => undefined);
      socket.on('data', (chunk) => {
        buffer += chunk.toString('binary');

        while (true) {
          if (inData) {
            const end = buffer.indexOf('\r\n.\r\n');
            if (end === -1) return;
            const raw = buffer.slice(0, end);
            buffer = buffer.slice(end + 5);
            inData = false;
            this.messages.push({
              from,
              to,
              raw,
              text: decodeQuotedPrintable(raw),
            });
            from = '';
            to = [];
            socket.write('250 OK queued\r\n');
            continue;
          }

          const eol = buffer.indexOf('\r\n');
          if (eol === -1) return;
          const line = buffer.slice(0, eol);
          buffer = buffer.slice(eol + 2);
          const upper = line.toUpperCase();

          if (upper.startsWith('EHLO'))
            socket.write('250-sink\r\n250 AUTH PLAIN LOGIN\r\n');
          else if (upper.startsWith('HELO')) socket.write('250 sink\r\n');
          else if (upper.startsWith('AUTH PLAIN')) socket.write('235 ok\r\n');
          else if (upper.startsWith('AUTH LOGIN'))
            socket.write('334 VXNlcm5hbWU6\r\n');
          else if (upper.startsWith('MAIL FROM')) {
            from = line;
            socket.write('250 OK\r\n');
          } else if (upper.startsWith('RCPT TO')) {
            to.push(line);
            socket.write('250 OK\r\n');
          } else if (upper === 'DATA') {
            inData = true;
            socket.write('354 go\r\n');
          } else if (upper === 'QUIT') {
            socket.write('221 bye\r\n');
            socket.end();
          } else socket.write('235 ok\r\n'); // AUTH LOGIN steps
        }
      });
    });

    return new Promise<void>((resolve) =>
      this.server!.listen(port, '127.0.0.1', () => resolve()),
    );
  }

  public stop() {
    return new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }

  public clear() {
    this.messages = [];
  }

  /** Messages sent to this address */
  public to(email: string) {
    return this.messages.filter((m) =>
      m.to.some((t) => t.toLowerCase().includes(email.toLowerCase())),
    );
  }

  /** The (first) link inside the last email sent to this address */
  public lastLink(email: string): string | undefined {
    const mails = this.to(email);
    const last = mails[mails.length - 1];
    return last?.text.match(/href="([^"]+)"/)?.[1];
  }
}
