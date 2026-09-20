-- 创建 music 表
CREATE TABLE IF NOT EXISTS music (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  album TEXT NOT NULL,
  release_date TEXT NOT NULL,
  type TEXT NOT NULL,
  roles TEXT[] NOT NULL DEFAULT '{}',
  plays TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  is_self_composed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 创建 shows 表
CREATE TABLE IF NOT EXISTS shows (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  date TEXT NOT NULL,
  duration TEXT NOT NULL DEFAULT '',
  views TEXT NOT NULL DEFAULT '',
  members TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT '已补档',
  thumbnail_from TEXT NOT NULL DEFAULT '',
  thumbnail_to TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  links JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 创建 social_posts 表
CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  platform TEXT NOT NULL,
  author TEXT NOT NULL,
  member TEXT,
  content TEXT NOT NULL,
  images TEXT[] NOT NULL DEFAULT '{}',
  videos TEXT[] NOT NULL DEFAULT '{}',
  post_url TEXT NOT NULL DEFAULT '',
  post_date TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 启用 RLS
ALTER TABLE music ENABLE ROW LEVEL SECURITY;
ALTER TABLE shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户读写（公开网站，无认证系统）
DROP POLICY IF EXISTS "Allow public read" ON music;
DROP POLICY IF EXISTS "Allow public insert" ON music;
DROP POLICY IF EXISTS "Allow public update" ON music;
DROP POLICY IF EXISTS "Allow public delete" ON music;
CREATE POLICY "Allow public read" ON music FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON music FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON music FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON music FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read" ON shows;
DROP POLICY IF EXISTS "Allow public insert" ON shows;
DROP POLICY IF EXISTS "Allow public update" ON shows;
DROP POLICY IF EXISTS "Allow public delete" ON shows;
CREATE POLICY "Allow public read" ON shows FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON shows FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON shows FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON shows FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read" ON social_posts;
DROP POLICY IF EXISTS "Allow public insert" ON social_posts;
DROP POLICY IF EXISTS "Allow public update" ON social_posts;
DROP POLICY IF EXISTS "Allow public delete" ON social_posts;
CREATE POLICY "Allow public read" ON social_posts FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON social_posts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON social_posts FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON social_posts FOR DELETE USING (true);

-- 数据版本表（乐观锁，用于视频档案导入冲突检测）
CREATE TABLE IF NOT EXISTS sync_meta (
  id TEXT PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE sync_meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read" ON sync_meta;
DROP POLICY IF EXISTS "Allow public insert" ON sync_meta;
DROP POLICY IF EXISTS "Allow public update" ON sync_meta;
CREATE POLICY "Allow public read"   ON sync_meta FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON sync_meta FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON sync_meta FOR UPDATE USING (true);
INSERT INTO sync_meta (id, version) VALUES ('shows', 0) ON CONFLICT (id) DO NOTHING;

-- 原子递增 shows 版本号
CREATE OR REPLACE FUNCTION bump_shows_version() RETURNS BIGINT
LANGUAGE sql VOLATILE AS $$
  UPDATE sync_meta SET version = version + 1, updated_at = now()
  WHERE id = 'shows' RETURNING version;
$$;
GRANT EXECUTE ON FUNCTION bump_shows_version() TO anon, authenticated;
