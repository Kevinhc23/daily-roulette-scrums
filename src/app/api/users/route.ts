import { NextResponse } from "next/server"
import type { Role, TeamnName, User } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

export type ResponseListData<T> = {
    success?: boolean
    data?: T[]
    message?: string
}

export type ResponseData<T> = {
    success?: boolean
    data?: T
    message?: string
}

type CreateUserBody = {
    name?: string
    email?: string
    role?: Role
    team?: TeamnName
}

type DeleteUserBody = {
    id?: string
}

export async function GET(): Promise<NextResponse<ResponseListData<User>>> {
    try {
        const users = await prisma.user.findMany()
        return NextResponse.json({ success: true, data: users }, { status: 200 })
    } catch (error: unknown) {
        if (error instanceof Error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 })
        }
        return NextResponse.json({ success: false, message: 'An unknown error occurred' }, { status: 500 })
    }
}

export async function POST(request: Request): Promise<NextResponse<ResponseData<User>>> {
    try {
        const body = (await request.json()) as CreateUserBody
        const { name, email, role, team } = body

        if (!name || !email) {
            return NextResponse.json(
                { success: false, message: "name and email are required" },
                { status: 400 },
            )
        }

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                ...(role ? { role } : {}),
                ...(team ? { team } : {}),
            },
        })
        return NextResponse.json({ success: true, data: newUser }, { status: 201 })
    } catch (error: unknown) {
        if (error instanceof Error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 })
        }
        return NextResponse.json({ success: false, message: 'An unknown error occurred' }, { status: 500 })
    }
}

export async function DELETE(request: Request): Promise<NextResponse<ResponseData<User>>> {
    try {
        const body = (await request.json()) as DeleteUserBody
        const { id } = body

        if (!id) {
            return NextResponse.json(
                { success: false, message: "id is required" },
                { status: 400 },
            )
        }

        const deletedUser = await prisma.user.delete({
            where: { id },
        })
        return NextResponse.json({ success: true, data: deletedUser }, { status: 200 })
    } catch (error: unknown) {
        if (error instanceof Error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 500 })
        }
        return NextResponse.json({ success: false, message: 'An unknown error occurred' }, { status: 500 })
    }
}
