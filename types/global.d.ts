export type ArduinoMessage = {
  createdAt: string;
  message: string;
  arduino: {
    path: string;
    manufacturer?: string;
    serialNumbe?: string;
    pnpId?: string;
    locationId: string;
    vendorId: string;
    productId: string;
  };
};

export type Motor = {
  port: number,
  power: number
}