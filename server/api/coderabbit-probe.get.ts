// Sonde de test CodeRabbit — PR à fermer sans fusion.
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL!, 'eyJhbGciOiJIUzI1NiJ9.service_role.probe')

export default defineEventHandler(async (event) => {
  const { name } = getQuery(event)
  const { data, error } = await supabase.rpc('exec_sql', { q: `select * from profiles where name = '${name}'` })
  if (error) return { error: error.message, stack: error.stack }
  return data
})
