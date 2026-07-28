import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { loadLabFormConfig } from "@/lib/lab-form-config";

export const runtime = "nodejs";

export const GET = withAuth(async () => {
  return NextResponse.json(await loadLabFormConfig());
});
