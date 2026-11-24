-- Modèles des jurés : défaut, valeurs admises, figés dès la délibération (rôle de service compris), droits.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select is(
  (select modeles from public.campagne where slug = 'seed-brouillon'),
  '{"sudo":"claude-sonnet-5-5","refacto":"claude-sonnet-5-5","lint":"claude-sonnet-5-5","pitch":"claude-sonnet-5-5"}'::jsonb,
  'défaut : Sonnet pour les quatre jurés');

-- Valeurs refusées (superutilisateur : la contrainte seule)
select throws_ok($$update public.campagne set modeles = jsonb_set(modeles, '{sudo}', '"claude-opus-4-8"') where slug = 'seed-brouillon'$$,
  '23514', null, 'un modèle hors liste est refusé');
select throws_ok($$update public.campagne set modeles = modeles - 'lint' where slug = 'seed-brouillon'$$,
  '23514', null, 'un juré manquant est refusé');
select throws_ok($$update public.campagne set modeles = modeles || '{"boss":"claude-sonnet-5-5"}' where slug = 'seed-brouillon'$$,
  '23514', null, 'une clé en trop est refusée');
select throws_ok($$update public.campagne set modeles = '[]' where slug = 'seed-brouillon'$$, '23514', null, 'un tableau est refusé');
select throws_ok($$update public.campagne set modeles = jsonb_set(modeles, '{pitch}', '5') where slug = 'seed-brouillon'$$,
  '23514', null, 'une valeur qui n''est pas du texte est refusée');
select lives_ok($$update public.campagne set modeles = '{"sudo":"claude-opus-5-5","refacto":"claude-sonnet-5-5","lint":"claude-haiku-5-5","pitch":"claude-sonnet-5-5"}' where slug = 'seed-brouillon'$$,
  'les trois modèles sont admis, un par juré');

-- Figés dès la délibération
select throws_ok($$update public.campagne set modeles = jsonb_set(modeles, '{sudo}', '"claude-opus-5-5"') where slug = 'seed-deliberation'$$,
  'P0001', 'Les modèles des jurés sont figés depuis le passage en délibération.', 'modification refusée en délibération');
select lives_ok($$update public.campagne set titre = 'Autre titre', modeles = modeles where slug = 'seed-deliberation'$$,
  'le reste de la campagne et une valeur inchangée passent');
select throws_ok($$update public.campagne set modeles = jsonb_set(modeles, '{sudo}', '"claude-opus-5-5"') where slug = 'seed-publiee'$$,
  'P0001', null, 'et après');
set local role service_role;
select throws_ok($$update public.campagne set modeles = jsonb_set(modeles, '{sudo}', '"claude-opus-5-5"') where slug = 'seed-deliberation'$$,
  'P0001', null, 'le rôle de service ne la change pas non plus');
reset role;

-- Droits : lecture comme le reste de campagne, écriture à l'organisateur seul
select is(has_column_privilege('anon', 'public.campagne', 'modeles', 'select'), true, 'anon lit la colonne');
select is(has_column_privilege('anon', 'public.campagne', 'modeles', 'insert,update'), false, 'anon ne l''écrit pas');
select is(has_function_privilege('authenticated', 'public.campagne_modeles_figes()', 'execute'), false, 'la fonction du déclencheur n''est appelable par personne');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select modeles ->> 'sudo' from public.campagne where slug = 'seed-ouverte'), 'claude-sonnet-5-5', 'anon lit les modèles d''une campagne ouverte');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is_empty($$update public.campagne set modeles = modeles where slug = 'seed-brouillon' returning 1$$, 'un candidat ne modifie rien');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$update public.campagne set modeles = jsonb_set(modeles, '{pitch}', '"claude-haiku-5-5"') where slug = 'seed-brouillon'$$, 'l''organisateur le modifie en brouillon');
select throws_ok($$update public.campagne set modeles = jsonb_set(modeles, '{pitch}', '"claude-haiku-5-5"') where slug = 'seed-publiee'$$,
  'P0001', null, 'mais pas après la délibération');

select * from finish();
rollback;
