// Campagne publique de l'URL, lue par le serveur pendant le rendu (la RLS cache les brouillons : 404).
export async function useCampagne(slug: string) {
  const { data, error } = await useFetch(`/api/campagnes/${slug}`, { key: `campagne-${slug}` })
  if (!data.value) {
    throw createError({
      statusCode: error.value?.statusCode === 404 ? 404 : 503,
      statusMessage: error.value?.statusCode === 404 ? 'Campagne introuvable' : 'Campagne illisible pour le moment',
      fatal: true,
    })
  }
  return data as Ref<NonNullable<typeof data.value>>
}
