import { NextResponse } from 'next/server'

export async function GET() {
  const startTime = Date.now()
  
  return NextResponse.json({
    message: 'Server is responsive',
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - startTime
  })
} 