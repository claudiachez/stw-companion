-- Add user_id to conviction_comments to support personal subscriber notes.
-- NULL user_id = admin public note (visible to all premium subscribers).
-- Non-null user_id = private personal note (visible only to that user).

ALTER TABLE conviction_comments
  ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Drop old blanket RLS policies and replace with per-role rules
DROP POLICY IF EXISTS "cc_authenticated_read" ON conviction_comments;
DROP POLICY IF EXISTS "cc_admin_write"        ON conviction_comments;

-- SELECT: public notes (user_id IS NULL) or your own notes
CREATE POLICY "cc_select" ON conviction_comments
  FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

-- INSERT: admin inserts public notes (user_id NULL); subscribers insert own notes
CREATE POLICY "cc_insert" ON conviction_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      (SELECT email FROM auth.users WHERE id = auth.uid()) = 'cc@claudiachez.com'
      AND (user_id IS NULL OR user_id = auth.uid())
    )
    OR user_id = auth.uid()
  );

-- DELETE: admin deletes anything; subscribers delete only their own
CREATE POLICY "cc_delete" ON conviction_comments
  FOR DELETE TO authenticated
  USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) = 'cc@claudiachez.com'
    OR user_id = auth.uid()
  );
