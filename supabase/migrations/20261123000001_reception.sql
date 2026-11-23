-- Réception d'un dépôt : l'état entre l'envoi du zip et son contrôle (SPECS § 4), et le bucket privé
-- qui reçoit les archives. Le contrôle lui-même vit hors de ce dépôt ; il lira cette table.

-- Bucket privé : 20 Mo, zip seulement. Aucune politique sur storage.objects, donc refus par défaut
-- pour anon et authenticated : l'envoi passe par une URL signée délivrée par le serveur, la
-- lecture et l'effacement par la clé de service.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('depots', 'depots', false, 20971520, array['application/zip']);

create type public.reception_etat as enum ('en_attente', 'acceptee', 'refusee');

-- Une seule réception par participation : un nouvel envoi remplace la ligne (le serveur efface
-- l'ancienne archive). chemin_stockage est choisi par le serveur. motifs_refus : liste de
-- { code, message }, les messages étant destinés au candidat.
create table public.reception (
  id uuid primary key default gen_random_uuid(),
  participation_id uuid not null unique references public.participation (id) on delete cascade,
  chemin_stockage text not null,
  presentation text not null check (char_length(presentation) between 1 and 500),
  demande text check (char_length(demande) <= 80),
  type_code public.type_code not null,
  outils_ia jsonb not null default '[]' check (jsonb_typeof(outils_ia) = 'array'),
  contact_reutilisation boolean not null default false,
  declaration_code_le timestamptz not null,
  etat public.reception_etat not null default 'en_attente',
  motifs_refus jsonb not null default '[]' check (jsonb_typeof(motifs_refus) = 'array'),
  recue_le timestamptz not null default now(),
  traitee_le timestamptz,
  check ((etat = 'en_attente') = (traitee_le is null))
);

-- Seul le rôle de service écrit (aucun privilège d'écriture pour anon ni authenticated).
-- Lecture : l'organisateur seul, sauf la case de réutilisation, qui n'influence pas le vote à
-- l'aveugle (même règle que depot). Le candidat lit la sienne par la vue ma_reception, sans
-- chemin_stockage.
alter table public.reception enable row level security;
grant select (
  id, participation_id, chemin_stockage, presentation, demande, type_code, outils_ia,
  declaration_code_le, etat, motifs_refus, recue_le, traitee_le
) on public.reception to authenticated;
create policy reception_lecture on public.reception for select to authenticated
  using ((select public.est_organisateur()));

create view public.ma_reception with (security_invoker = false) as
select r.participation_id, r.presentation, r.demande, r.type_code, r.outils_ia, r.contact_reutilisation,
       r.declaration_code_le, r.etat, r.motifs_refus, r.recue_le, r.traitee_le
from public.reception r
join public.participation p on p.id = r.participation_id
where p.compte_id = (select auth.uid());
grant select on public.ma_reception to authenticated;

-- Places restantes d'une campagne visible : un nombre, aucune donnée de participant. Publique
-- comme la campagne. L'organisateur peut dépasser le quota de deux places (SPECS § 3) : le
-- compte ne descend pas sous zéro.
create view public.places_campagne with (security_invoker = false) as
select c.id as campagne_id,
       greatest(c.max_participants - count(p.id) filter (where p.etat = 'inscrit'), 0)::integer as places_restantes
from public.campagne c
left join public.participation p on p.campagne_id = c.id
where c.statut <> 'brouillon'
group by c.id;
grant select on public.places_campagne to anon, authenticated;
