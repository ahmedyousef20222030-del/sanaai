'use client'

interface ApiErrorHandlerProps {
  error: Error | null
  isLoading?: boolean
  retry?: () => void
}

export function ApiErrorHandler({ error, isLoading, retry }: ApiErrorHandlerProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">🔴</span>
          <div className="flex-1">
            <h3 className="font-semibold text-red-900 mb-1">حدث خطأ</h3>
            <p className="text-red-700 text-sm mb-3">
              {error.message || 'فشل تحميل البيانات'}
            </p>
            {retry && (
              <button
                onClick={retry}
                className="text-sm px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition"
              >
                حاول مرة أخرى
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
