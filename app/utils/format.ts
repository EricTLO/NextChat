export function prettyObject(msg: any) {
  const obj = msg;
  /*if (typeof msg !== "string") {
    msg = JSON.stringify(msg, null, "  ");
  }*/
   if (typeof msg === "string") {
    try {
      // 尝试解析 JSON 字符串
      JSON.parse(msg);
      // 如果解析成功，说明 msg 已经是 JSON 字符串，不需要再次格式化
    } catch (error) {
      // 如果解析失败，说明 msg 不是 JSON 字符串，需要进行格式化
      msg = JSON.stringify(msg, null, "  ");
    }
  } else {
    // 如果 msg 不是字符串，则将其转换为 JSON 字符串
    msg = JSON.stringify(msg, null, "  ");
  }
  
  if (msg === "{}") {
    return obj.toString();
  }
  if (msg.startsWith("```json")) {
    return msg;
  }
  return ["```json", msg, "```"].join("\n");
}

export function* chunks(s: string, maxBytes = 1000 * 1000) {
  const decoder = new TextDecoder("utf-8");
  let buf = new TextEncoder().encode(s);
  while (buf.length) {
    let i = buf.lastIndexOf(32, maxBytes + 1);
    // If no space found, try forward search
    if (i < 0) i = buf.indexOf(32, maxBytes);
    // If there's no space at all, take all
    if (i < 0) i = buf.length;
    // This is a safe cut-off point; never half-way a multi-byte
    yield decoder.decode(buf.slice(0, i));
    buf = buf.slice(i + 1); // Skip space (if any)
  }
}
