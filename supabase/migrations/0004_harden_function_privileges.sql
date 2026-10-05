-- Durcissement : ces fonctions SECURITY DEFINER ne doivent pas être appelables via l'API publique.
revoke execute on function public.handle_new_user() from public, anon, authenticated;   -- trigger d'inscription uniquement
revoke execute on function public.owns_property(uuid) from public, anon;                -- helper RLS : utilisateurs connectés seulement
grant execute on function public.owns_property(uuid) to authenticated;
