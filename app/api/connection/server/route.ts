import { NextResponse } from "next/server";
import os from "os";

export async function GET() {
  const interfaces = os.networkInterfaces();

  const ips = Object.values(interfaces)
    .flat()
    ?.filter(i => i && i.family === "IPv4" && !i.internal)
    .map(i => i?.address);

  return NextResponse.json(ips);
}
