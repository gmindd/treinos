import { FormularioLogin } from "./formulario";

export const metadata = { title: "Entrar · Treino 26/27" };

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const { seguinte } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-16">
      <h1 className="text-2xl font-semibold">Treino 26/27</h1>
      <FormularioLogin seguinte={typeof seguinte === "string" ? seguinte : undefined} />
    </main>
  );
}
