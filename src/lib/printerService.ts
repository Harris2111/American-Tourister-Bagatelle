
/**
 * Printer Service for SK58 Portable Bluetooth Thermal Printer
 * Uses Web Bluetooth API and ESC/POS commands
 */

export interface LabelData {
  model: string;
  description: string;
  price: number;
  promoPrice?: number;
  rotate?: boolean;
}

class PrinterService {
  private device: any = null;
  private characteristic: any = null;

  // ESC/POS Command Constants
  private readonly ESC = 0x1B;
  private readonly GS = 0x1D;
  private readonly LF = 0x0A;

  /**
   * Connect to the Bluetooth printer
   */
  async connect(): Promise<boolean> {
    try {
      const bluetooth = (navigator as any).bluetooth;
      if (this.device && this.device.gatt?.connected && this.characteristic) {
        return true;
      }

      console.log('Requesting Bluetooth Device...');
      this.device = await bluetooth.requestDevice({
        filters: [
          { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // Common for some thermal printers
          { namePrefix: 'SK58' },
          { namePrefix: 'Printer' },
          { namePrefix: 'MTP' }
        ],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
      });

      console.log('Connecting to GATT Server...');
      const server = await this.device.gatt?.connect();
      
      console.log('Getting Service...');
      // We try to find the write characteristic. Most cheap printers use the same service/char patterns.
      const services = await server?.getPrimaryServices();
      if (!services) throw new Error('No services found');

      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            this.characteristic = char;
            console.log('Found write characteristic:', char.uuid);
            break;
          }
        }
        if (this.characteristic) break;
      }

      if (!this.characteristic) {
        throw new Error('Could not find a writable characteristic on the printer.');
      }

      return true;
    } catch (error) {
      console.error('Bluetooth Connection Error:', error);
      return false;
    }
  }

  /**
   * Disconnect from the printer
   */
  disconnect() {
    if (this.device && this.device.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.characteristic = null;
  }

  /**
   * Send raw bytes to the printer
   */
  private async sendRaw(data: Uint8Array) {
    if (!this.characteristic) throw new Error('Printer not connected');
    
    // Most printers have a buffer limit of ~20 bytes or more. 
    // We send in chunks if needed, though for small labels it's usually fine.
    const chunkSize = 20;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      await this.characteristic.writeValue(chunk);
    }
  }

  /**
   * Helper to convert string to bytes (standard ASCII)
   */
  private strToBytes(str: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(str);
  }

  /**
   * Helper to wrap text into multiple lines
   */
  private wrapText(text: string, maxChars: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach(word => {
      if ((currentLine + (currentLine ? ' ' : '') + word).length <= maxChars) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  /**
   * Print a labels
   */
  async printLabel(data: LabelData): Promise<void> {
    const connected = await this.connect();
    if (!connected) throw new Error('Failed to connect to printer');

    const commands = [];

    // 1. Initialize Printer (Removed ESC @ as it may cause self-test pages)
    // 1b. Enter Label Mode (Specific for many Sinmark/Thermal printers)
    commands.push(0x1F, 0x1B, 0x1F, 0x4C, 0x01);
    
    // 2. Select Center Alignment
    commands.push(this.ESC, 0x61, 0x01);
    
    // Ensure normal size (Reset any previous scaling)
    commands.push(this.GS, 0x21, 0x00);

    // Rotation support (Rotate characters 90 deg clockwise)
    if (data.rotate) {
      commands.push(this.ESC, 0x56, 0x01);
    }

    // 3. Print Item Code (Bold, at the very top)
    commands.push(this.ESC, 0x45, 0x01); // Bold on
    commands.push(...this.strToBytes(data.model));
    commands.push(this.LF);
    commands.push(this.ESC, 0x45, 0x00); // Bold off

    // 4. Print Description (Normal, Wrapped tightly for 45mm width)
    // 45mm supports ~24 characters, using 22 for safe margins
    const descLines = this.wrapText(data.description, 22); 
    descLines.slice(0, 2).forEach(line => {
      commands.push(...this.strToBytes(line), this.LF);
    });

    // 5. Price Section (Bold only, same size as description)
    if (data.promoPrice && data.promoPrice > 0) {
      commands.push(...this.strToBytes(`Normal Price: Rs ${data.price.toLocaleString()}`), this.LF);
      commands.push(this.ESC, 0x45, 0x01); // Bold on
      commands.push(...this.strToBytes(`Promo Price: Rs ${data.promoPrice.toLocaleString()}`));
      commands.push(this.LF);
      commands.push(this.ESC, 0x45, 0x00); // Bold off
    } else {
      commands.push(this.ESC, 0x45, 0x01); // Bold on
      commands.push(...this.strToBytes(`Price: Rs ${data.price.toLocaleString()}`));
      commands.push(this.LF);
      commands.push(this.ESC, 0x45, 0x00); // Bold off
    }

    // 6. Footer: VAT INCLUDED (Standard size)
    // Minimal spacing for 25mm height
    commands.push(...this.strToBytes('VAT INCLUDED'));
    
    // 7. GS FF (Feed to next label gap / black mark)
    // This is the standard command for many Label Printers instead of just plain FF (0x0C)
    commands.push(0x1D, 0x0C); 
    
    // Reset rotation if it was enabled
    if (data.rotate) {
      commands.push(this.ESC, 0x56, 0x00);
    }

    await this.sendRaw(new Uint8Array(commands));
  }
}

export const printerService = new PrinterService();
