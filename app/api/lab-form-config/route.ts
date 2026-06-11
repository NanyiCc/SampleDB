import { NextResponse } from "next/server";
import { loadLabFormConfig } from "@/lib/lab-form-config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await loadLabFormConfig());
}
