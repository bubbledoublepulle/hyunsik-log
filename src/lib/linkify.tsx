/** 将文本中的 URL 转换为可点击的超链接（无重复） */
export function linkifyText(text: string): React.ReactNode[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    const url = match[0];
    result.push(
      <a
        key={`link-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-steel-500 hover:text-steel-600 hover:underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
    lastIndex = match.index + url.length;
  }

  if (lastIndex < text.length) {
    result.push(<span key={`text-end`}>{text.slice(lastIndex)}</span>);
  }

  return result;
}
