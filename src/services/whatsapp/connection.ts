import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  ConnectionState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { WhatsAppServiceConfig } from "./types";

export class WhatsAppConnection {
  private socket: WASocket | null = null;
  private config: WhatsAppServiceConfig;
  private logger = pino({ level: "info" });
  private isConnected = false;

  constructor(config: WhatsAppServiceConfig) {
    this.config = config;
  }

  async connect(): Promise<WASocket> {
    const { state, saveCreds } = await useMultiFileAuthState(
      this.config.sessionPath,
    );
    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: this.config.printQRInTerminal ?? true,
      logger: this.logger,
      browser: ["Memorae", "Chrome", "1.0.0"],
      getMessage: async () => undefined,
    });

    // Handle connection updates
    this.socket.ev.on(
      "connection.update",
      async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && this.config.printQRInTerminal) {
          this.logger.info("Scan QR code to connect WhatsApp");
          qrcode.generate(qr, { small: true });
        }

        if (connection === "close") {
          const shouldReconnect =
            (lastDisconnect?.error as Boom)?.output?.statusCode !==
            DisconnectReason.loggedOut;

          this.logger.info({ shouldReconnect }, "Connection closed");
          this.isConnected = false;
          this.config.onConnectionUpdate?.(false);

          if (shouldReconnect) {
            await this.connect();
          }
        } else if (connection === "open") {
          this.logger.info("✅ WhatsApp connection established");
          this.isConnected = true;
          this.config.onConnectionUpdate?.(true);
        }
      },
    );

    // Save credentials on update
    this.socket.ev.on("creds.update", saveCreds);

    return this.socket;
  }

  getSocket(): WASocket | null {
    return this.socket;
  }

  isSocketConnected(): boolean {
    return this.isConnected && this.socket !== null;
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
      this.isConnected = false;
      this.logger.info("WhatsApp disconnected");
    }
  }
}
