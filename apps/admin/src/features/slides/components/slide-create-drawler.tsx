import { useIsMutating } from "@tanstack/react-query";
import { useState } from "react";
import { slidesKeys } from "../queries/slides.keys";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SlideForm } from "../forms/slide.form";
import { Spinner } from "@/components/ui/spinner";


export function SlideCreateDrawer() {
    const [isOpen, setIsOpen] = useState(false);
    const [resetKey, setResetKey] = useState(0);
    const FORM_ID = "create-slide-drawer-form";
    const isMutating = useIsMutating({ mutationKey: slidesKeys.all }) > 0;

    return (
        <Drawer
            open={isOpen}
            onOpenChange={(open) => {
                setIsOpen(open);
                if (!open) setResetKey((k) => k + 1);
            }}
            swipeDirection="right"
        >
            <DrawerTrigger render={<Button variant="ghost" className="shadow-sm" />}>
                <Plus />
                Crear Slide
            </DrawerTrigger>

            <DrawerContent>
                <DrawerHeader>
                    <DrawerTitle>Slide</DrawerTitle>
                    <DrawerDescription>Crear una nueva slide</DrawerDescription>
                </DrawerHeader>

                <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
                    {isOpen && (
                        <SlideForm
                            key={resetKey}
                            formId={FORM_ID}
                            onSuccess={() => setIsOpen(false)}
                        />
                    )}
                </div>

                <DrawerFooter>
                    <Button type="submit" form={FORM_ID} disabled={isMutating}>
                        {isMutating
                            ? <>
                                <Spinner /> Creando Slide
                            </>
                            : "Crear Slide"}
                    </Button>
                    <DrawerClose>
                        <Button variant="outline" className="w-full">
                            Cancelar
                        </Button>
                    </DrawerClose>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}