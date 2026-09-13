/*
  Warnings:

  - A unique constraint covering the columns `[householdId,date,category]` on the table `PlanEntry` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `category` to the `PlanEntry` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MealCategory" AS ENUM ('soup', 'main');

-- DropIndex
DROP INDEX "PlanEntry_householdId_date_key";

-- AlterTable
ALTER TABLE "Meal" ADD COLUMN     "category" "MealCategory" NOT NULL DEFAULT 'main';

-- AlterTable
ALTER TABLE "PlanEntry" ADD COLUMN     "category" "MealCategory";
UPDATE "PlanEntry" SET "category" = 'main' WHERE "category" IS NULL;
ALTER TABLE "PlanEntry" ALTER COLUMN "category" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PlanEntry_householdId_date_category_key" ON "PlanEntry"("householdId", "date", "category");
