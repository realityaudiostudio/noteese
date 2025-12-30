import { createClient } from '@supabase/supabase-js'

// REPLACE THESE WITH YOUR KEYS FROM SUPABASE DASHBOARD
const supabaseUrl = 'https://gavzxskqwdtnfvdxmfjk.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdhdnp4c2txd2R0bmZ2ZHhtZmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwODUxMzUsImV4cCI6MjA4MjY2MTEzNX0.SEvSxAChXTSzPLZIjOs86hWRCKPnOx8isrzqP0X5y0E'

export const supabase = createClient(supabaseUrl, supabaseKey)