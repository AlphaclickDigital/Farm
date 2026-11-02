import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async create(data: { name: string; slug: string }) {
    return this.prisma.category.create({ data });
  }

  async seed() {
    const categories = [
      { name: 'Vegetables', slug: 'vegetables' },
      { name: 'Fruits', slug: 'fruits' },
      { name: 'Dairy', slug: 'dairy' },
      { name: 'Grains', slug: 'grains' },
      { name: 'Meat', slug: 'meat' },
      { name: 'Herbs', slug: 'herbs' },
    ];

    for (const cat of categories) {
      await this.prisma.category.upsert({
        where: { slug: cat.slug },
        update: {},
        create: cat,
      });
    }

    return this.findAll();
  }
}
