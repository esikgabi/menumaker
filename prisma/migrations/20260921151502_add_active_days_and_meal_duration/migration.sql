-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "activeWeekdays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[];

-- AlterTable
ALTER TABLE "Meal" ADD COLUMN     "durationDays" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "PlanDayOverride" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "PlanDayOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanDayOverride_householdId_date_key" ON "PlanDayOverride"("householdId", "date");

-- AddForeignKey
ALTER TABLE "PlanDayOverride" ADD CONSTRAINT "PlanDayOverride_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
