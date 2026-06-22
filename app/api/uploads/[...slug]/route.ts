import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import mime from "mime-types";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string[] } },
) {
  const slug = params.slug;
  if (!slug || !slug.length) {
    return new NextResponse("File not specified", { status: 400 });
  }

  const fileName = slug.join("/");
  const filePath = path.join(process.cwd(), "uploads", fileName);

  if (!fs.existsSync(filePath)) {
    return new NextResponse("File not found", { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const mimeType = mime.lookup(filePath) || "application/octet-stream";

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": mimeType,
    },
  });
}
