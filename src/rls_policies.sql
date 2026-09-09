ALTER TABLE music ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on music" ON music FOR SELECT USING (true);
CREATE POLICY "Allow public read on social_posts" ON social_posts FOR SELECT USING (true);
CREATE POLICY "Allow public read on shows" ON shows FOR SELECT USING (true);

CREATE POLICY "Allow auth insert on music" ON music FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow auth update on music" ON music FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow auth delete on music" ON music FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow auth insert on social_posts" ON social_posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow auth update on social_posts" ON social_posts FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow auth delete on social_posts" ON social_posts FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow auth insert on shows" ON shows FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow auth update on shows" ON shows FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow auth delete on shows" ON shows FOR DELETE USING (auth.role() = 'authenticated');

ALTER PUBLICATION supabase_realtime ADD TABLE music;
ALTER PUBLICATION supabase_realtime ADD TABLE social_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE shows;
