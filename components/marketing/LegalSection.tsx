export default function LegalSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-8 text-gray-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:text-gray-900 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1 [&_ol]:my-3 [&_p]:mb-3 [&_a]:text-blue-600 [&_a]:underline">
      <h2>{title}</h2>
      {children}
    </section>
  )
}
